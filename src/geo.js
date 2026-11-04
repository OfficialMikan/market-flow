// Location engine. Order of trust: exact coordinates from the listing > gazetteer town match (region-aware) > geocoder > none.
import { readFileSync } from "node:fs";
import { haversine, zoneFor } from "./pipeline.js";
export { zoneFor };
const PLACES = JSON.parse(readFileSync(new URL("./data/ph_places.json", import.meta.url), "utf8"));
const strip = s => s.replace(/\s+city$/, "");
const INDEX = new Map(); // phrase -> places (both "quezon city" and "quezon" are indexed)
for (const p of PLACES) for (const k of new Set([p.n, strip(p.n)])) if (k.length >= 4) (INDEX.get(k) ?? INDEX.set(k, []).get(k)).push(p);
const cf = PLACES.find(p => p.n === "clark freeport"); if (cf) INDEX.set("clark", [cf]); // "Clark" or "SM Clark" is the freeport in Angeles
const KEYS = [...INDEX.keys()].sort((a, b) => b.length - a.length); // longest phrase wins

const fold = s => String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
export const regionHint = t => { const m = /\bPH-([0-9A-Z]{2,3})\b/i.exec(t || ""); return m ? m[1].toUpperCase() : /\bNCR\b/i.test(t || "") ? "NCR" : null; };
const words = t => fold(t).replace(/\bph-[0-9a-z]+\b|\bncr\b/gi, " ").replace(/[^a-z0-9 ]/g, " ").replace(/\b(city of|municipality of|brgy|barangay)\b/g, " ").replace(/\s+/g, " ").trim();
const has = (hay, k) => ` ${hay} `.includes(` ${k} `);

export function matchPlace(text, home) {
  const hint = regionHint(text), full = words(text), short = strip(full);
  for (const k of KEYS) {
    if (!has(full, k) && !has(short, k)) continue;
    let c = INDEX.get(k);
    if (hint) { c = c.filter(p => p.r === hint); if (!c.length) continue; }   // wrong-region namesakes are never accepted
    if (c.length === 1) return { ...c[0], precision: c[0].a ? "guess" : "town" };
    const near = [...c].sort((a, b) => (home ? haversine(home.lat, home.lng, a.la, a.lo) - haversine(home.lat, home.lng, b.la, b.lo) : b.p - a.p))[0];
    return { ...near, precision: "guess" };                                    // several namesakes and no region: closest to you, marked approximate
  }
  return null;
}
export function homeRegion(home) {
  let best = null, bd = 1e9;
  for (const p of PLACES) { const d = haversine(home.lat, home.lng, p.la, p.lo); if (d < bd) { bd = d; best = p; } }
  return best?.r || null;
}

const UA = "market-flow-personal/1.0 (github.com/OfficialMikan/market-flow)";
const sleep = ms => new Promise(r => setTimeout(r, ms));
// Nominatim (OpenStreetMap): max 1 request per second, results cached, capped per run.
export async function geocode(text, state) {
  const q = words(text);
  if (q.length < 4) return null;
  if (state.cache.has(q)) return state.cache.get(q);
  if (state.calls >= state.cap) return null;
  state.calls++;
  let out = { found: false };
  try {
    await sleep(state.delay ?? 1100);
    const r = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=ph&q=${encodeURIComponent(q + ", Philippines")}`, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(10000) });
    const j = r.ok ? await r.json() : [];
    if (j[0]) out = { found: true, la: +j[0].lat, lo: +j[0].lon, d: String(j[0].display_name || "").split(",")[0].slice(0, 60) };
  } catch (e) { console.error("  geocoder failed:", e.message); return null; }
  state.cache.set(q, out); state.fresh.push({ q, ...out });
  return out;
}
// Fills lat, lng, place, geoPrecision, region on every listing.
export async function locateAll(list, { home, cache = new Map(), cap = 12, delay } = {}) {
  const state = { cache, calls: 0, cap, delay, fresh: [] };
  for (const l of list) {
    if (l.geoPrecision) continue;                                               // already located in an earlier scan
    const texts = [l.meetup, l.area, l.locationText].filter(Boolean);
    let m = null;
    for (const t of texts) if ((m = matchPlace(t, home))) break;
    if (l.lat != null && l.lng != null) { l.geoPrecision = "exact"; l.place = m?.d?.replace(/ City$/, "") || l.place || ""; l.region = m?.r || null; continue; }
    if (m) { l.lat = m.la; l.lng = m.lo; l.place = m.d.replace(/ City$/, ""); l.region = m.r; l.geoPrecision = m.precision; continue; }
    for (const t of texts) {
      const g = await geocode(t, state);
      if (g?.found) { l.lat = g.la; l.lng = g.lo; l.place = g.d; l.geoPrecision = "geocoded"; break; }
    }
    if (!l.geoPrecision) l.geoPrecision = "none";
  }
  return state.fresh;                                                           // new geocoder answers, to be cached in the database
}

export function nearbyPlaces(home, n = 3) {
  return [...PLACES].sort((a, b) => haversine(home.lat, home.lng, a.la, a.lo) - haversine(home.lat, home.lng, b.la, b.lo)).slice(0, n).map(p => p.d.replace(/ City$/, ""));
}
