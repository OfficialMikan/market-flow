import { createClient } from "@supabase/supabase-js";
import { speedByName, soldMedianByName, findGone, redact, sellerScore, cleanExtra } from "./pipeline.js";
export const client = () =>
  process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY
    ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY) : null;

export async function save(sb, rows) {
  const old = new Map();
  for (let i = 0; i < rows.length; i += 100) {
    const { data, error } = await sb.from("listings").select("hash,price,alerted,prev_price,price_drop_pct,has_details,vision_done").in("hash", rows.slice(i, i + 100).map(r => r.hash));
    if (error) throw error;
    for (const d of data) old.set(d.hash, d);
  }
  const now = new Date().toISOString();
  const withDrop = rows.map(r => {
    const o = old.get(r.hash), p = r.price ?? null;
    const dropped = o && p != null && +o.price > p ? Math.round((o.price - p) / o.price * 100) : 0;
    const changed = o && p != null && +o.price !== p;
    return { ...r, alerted: o?.alerted || false, newDrop: dropped, prevPrice: changed ? +o.price : (o?.prev_price ?? null), dropPct: dropped || (changed ? 0 : (o?.price_drop_pct ?? 0)) };
  });
  const recs = withDrop.map(r => ({ hash: r.hash, source: r.source, url: r.url, title: redact(r.title).slice(0, 140) || "(no title)", name: r.name, category: r.category,
    price: r.price ?? null, resale: r.resale ?? null, margin_pct: r.marginPct, demand: r.demand, score: r.score, distance_km: r.distanceKm,
    location_text: redact(r.locationText || "").slice(0, 120) || null, image_url: r.imageUrl || null, comments: r.comments || 0, posted_at: r.postedAt || null, last_seen: now,
    q: r.q || null, removed_at: null, sell_days: r.sellDays ?? null, intent: r.intent || "sell", kind: r.kind || "listing", brand: r.brand || null,
    specs: r.specs || [], condition: r.conditionTxt || null, issues: r.issues || [], issue_level: r.issueLevel || 0, summary: r.summary || null,
    images: (r.images || []).filter(u => /^https:\/\//.test(u)).slice(0, 6), sell_price: r.sellPrice ?? null, sell_basis: r.sellBasis || null,
    confidence: r.confidence || null, net_profit: r.net ?? null, travel_cost: r.travel ?? null, offer_price: r.offerPrice ?? null,
    prev_price: r.prevPrice, price_drop_pct: r.dropPct, matches: r.matches || [], negotiable: r.negotiable ?? null, area: r.area || null,
    place: r.place || null, region: r.region || null, geo_precision: r.geoPrecision || null, lat: r.lat == null ? null : Math.round(r.lat * 100) / 100, lng: r.lng == null ? null : Math.round(r.lng * 100) / 100,
    model: r.model || null, color: r.color || null, year: r.year ?? null, quantity: r.quantity || 1, warranty: r.warranty || null, has_receipt: !!r.receipt, reason: r.reason || null, delivery: r.delivery || null,
    extra: cleanExtra(r.attributes), defects: r.defects || [], inclusions: r.inclusions || [], case_note: r.caseNote || null, photo_notes: r.photoNotes || null, mismatch: !!r.mismatch,
    has_details: !!r.detailed || !!old.get(r.hash)?.has_details, ai_demand: r.aiDemand ?? null, ai_resale: r.aiResale ?? null, vision_done: !!r.visionDone || !!old.get(r.hash)?.vision_done, price_note: r.priceNote || null, listed_price: r.listedPrice ?? null }));
  const hint = " (did you run supabase/migration-2.sql and migration-3.sql in Supabase?)";
  for (let i = 0; i < recs.length; i += 100) {
    const { error } = await sb.from("listings").upsert(recs.slice(i, i + 100), { onConflict: "hash" });
    if (error) throw new Error(error.message + hint);
  }
  // Seller names, profile links and full descriptions go to a private table the public key cannot read.
  const priv = withDrop.filter(r => r.seller || r.description || r.meetup || r.lat != null).map(r => ({ hash: r.hash, seller_name: r.seller?.name || null, seller_url: r.seller?.url || null,
    seller_rating: r.seller?.rating ?? null, seller_reviews: r.seller?.reviews ?? null, seller_tenure: r.seller?.tenureYears ?? null, seller_score: sellerScore(r.seller),
    description: String(r.description || "").slice(0, 2000) || null, meetup: r.meetup || null, lat: r.lat ?? null, lng: r.lng ?? null, updated_at: now }));
  for (let i = 0; i < priv.length; i += 100) {
    const { error } = await sb.from("listing_private").upsert(priv.slice(i, i + 100), { onConflict: "hash" });
    if (error) throw new Error(error.message + hint);
  }
  const hist = withDrop.filter(r => r.price > 0 && (!old.has(r.hash) || +old.get(r.hash).price !== r.price)).map(r => ({ hash: r.hash, price: r.price }));
  if (hist.length) { const { error } = await sb.from("price_history").insert(hist); if (error) throw error; }
  return withDrop;
}
export async function markAlerted(sb, hashes) {
  if (hashes.length) await sb.from("listings").update({ alerted: true }).in("hash", hashes);
}

export async function loadSettings(sb) {
  const { data, error } = await sb.from("settings").select("*").eq("id", 1).maybeSingle();
  if (error) { console.error("Could not read settings (run supabase/migration-2.sql):", error.message); return {}; }
  return data || {};
}
// Market knowledge from past scans: sell speed, sold prices, open buyer requests and current supply.
export async function loadContext(sb) {
  const since = new Date(Date.now() - 7 * 864e5).toISOString();
  const [gone, wanted, supply] = await Promise.all([
    sb.from("listings").select("name,price,intent,posted_at,first_seen,removed_at").not("removed_at", "is", null).limit(3000),
    sb.from("listings").select("hash,url,name,price,area,posted_at,first_seen").eq("intent", "wanted").is("removed_at", null).gte("last_seen", since).limit(500),
    sb.from("listings").select("hash,url,title,name,price,distance_km").eq("intent", "sell").is("removed_at", null).gte("last_seen", since).limit(1500)]);
  return { speed: speedByName(gone.data || []), soldPrice: soldMedianByName(gone.data || []), wanted: wanted.data || [], supply: supply.data || [] };
}
export async function setCursor(sb, cursor) { await sb.from("settings").update({ cursor }).eq("id", 1); }
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

// ----- v5: known listings, home, geocoder cache, groups -----
export async function loadKnown(sb, hashes) {
  const out = new Map(), cols = "hash,price,name,brand,category,intent,specs,condition,issues,issue_level,summary,model,color,year,quantity,warranty,has_receipt,reason,delivery,defects,inclusions,case_note,photo_notes,mismatch,has_details,vision_done,ai_demand,ai_resale,area,place,region,geo_precision,listed_price,price_note";
  for (let i = 0; i < hashes.length; i += 100) {
    const part = hashes.slice(i, i + 100);
    const { data, error } = await sb.from("listings").select(cols).in("hash", part).not("name", "is", null);
    if (error) { console.error("Could not read known listings:", error.message); return new Map(); }
    const { data: pv } = await sb.from("listing_private").select("hash,lat,lng").in("hash", part);
    const xy = new Map((pv || []).map(p => [p.hash, p]));
    for (const d of data || []) out.set(d.hash, { ...d, lat: xy.get(d.hash)?.lat ?? undefined, lng: xy.get(d.hash)?.lng ?? undefined });
  }
  return out;
}
export async function loadHome(sb) {
  const { data } = await sb.from("settings_private").select("*").eq("id", 1).maybeSingle();
  return data && data.home_lat != null && data.home_lng != null ? { lat: +data.home_lat, lng: +data.home_lng, name: data.home_name || "" } : null;
}
export async function loadGeoCache(sb) {
  const { data } = await sb.from("geo_cache").select("q,found,la,lo,d").limit(5000);
  return new Map((data || []).map(r => [r.q, r.found ? { found: true, la: +r.la, lo: +r.lo, d: r.d } : { found: false }]));
}
export async function saveGeoCache(sb, rows) {
  if (rows.length) await sb.from("geo_cache").upsert(rows.map(r => ({ q: r.q, found: !!r.found, la: r.la ?? null, lo: r.lo ?? null, d: r.d ?? null })), { onConflict: "q" });
}
export async function loadGroups(sb) { const { data } = await sb.from("fb_groups").select("*"); return data || []; }
export async function upsertGroups(sb, rows) {
  if (!rows.length) return;
  const { error } = await sb.from("fb_groups").upsert(rows, { onConflict: "url" });
  if (error) console.error("Could not save groups:", error.message);
}
