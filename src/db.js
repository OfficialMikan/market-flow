import { createClient } from \"@supabase/supabase-js\";
export const client = () =>
  process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY
    ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY) : null;

export async function save(sb, rows) {
  const old = new Map();
  for (let i = 0; i < rows.length; i += 100) {
    const { data, error } = await sb.from(\"listings\").select(\"hash,price,alerted\").in(\"hash\", rows.slice(i, i + 100).map(r => r.hash));
    if (error) throw error;
    for (const d of data) old.set(d.hash, d);
  }
  const now = new Date().toISOString();
  const recs = rows.map(r => ({ hash: r.hash, source: r.source, url: r.url, title: r.title, name: r.name, category: r.category,
    price: r.price, resale: r.resale, margin_pct: r.marginPct, demand: r.demand, score: r.score, distance_km: r.distanceKm,
    location_text: r.locationText || null, image_url: r.imageUrl || null, comments: r.comments || 0, posted_at: r.postedAt || null, last_seen: now }));
  for (let i = 0; i < recs.length; i += 100) {
    const { error } = await sb.from(\"listings\").upsert(recs.slice(i, i + 100), { onConflict: \"hash\" });
    if (error) throw error;
  }
  const hist = rows.filter(r => !old.has(r.hash) || +old.get(r.hash).price !== r.price).map(r => ({ hash: r.hash, price: r.price }));
  if (hist.length) { const { error } = await sb.from(\"price_history\").insert(hist); if (error) throw error; }
  
  const priceDrops = rows.filter(r => {
    const prev = old.get(r.hash);
    return prev && r.price < prev.price;
  }).map(r => ({ ...r, alerted: false }));

  return { 
    rows: rows.map(r => ({ ...r, alerted: old.get(r.hash)?.alerted || false })),
    priceDrops 
  };
}
export async function markAlerted(sb, hashes) {
  if (hashes.length) await sb.from(\"listings\").update({ alerted: true }).in(\"hash\", hashes);
}