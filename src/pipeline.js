import { createHash } from "node:crypto";
import { CONFIG, TOWNS } from "./config.js";
const FRICTION = 0.92; // haggling + fees: you realistically get ~92% of the resale price

export const hash = u => createHash("sha1").update(String(u).split("?")[0]).digest("hex");

export function haversine(a, b, c, d) {
  const R = 6371, r = x => x * Math.PI / 180;
  const h = Math.sin(r(c - a) / 2) ** 2 + Math.cos(r(a)) * Math.cos(r(c)) * Math.sin(r(d - b) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
export function distanceFor(l, home = CONFIG.home) {
  if (l.lat != null && l.lng != null) return haversine(home.lat, home.lng, l.lat, l.lng);
  const t = (l.locationText || "").toLowerCase();
  for (const [k, [la, ln]] of Object.entries(TOWNS)) if (t.includes(k)) return haversine(home.lat, home.lng, la, ln);
  return null;
}
export const median = a => {
  const s = [...a].sort((x, y) => x - y), m = s.length >> 1;
  return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : null;
};
export function dedupe(list) {
  const seen = new Map();
  for (const l of list) {
    if (!l.url || !(l.price > 0)) continue;
    const h = hash(l.url);
    if (!seen.has(h)) seen.set(h, { ...l, hash: h });
  }
  return [...seen.values()];
}
export function rank(list, radius = CONFIG.radiusKm, speed = {}) {
  const groups = {};
  for (const l of list) (groups[l.name] ??= []).push(l.price);
  const out = [];
  for (const l of list) {
    if (l.flag) continue;
    const dist = distanceFor(l);
    if (dist != null && dist > radius) continue;
    const g = groups[l.name];
    const resale = (g.length >= 3 ? median(g) : null) ?? l.resale ?? null;
    const margin = resale ? ((resale * FRICTION - l.price) / l.price) * 100 : 0;
    const engage = Math.min(100, (l.comments || 0) * 5 + (l.likes || 0) * 4);
    const days = speed[l.name];
    const sp = days == null ? null : Math.max(0, Math.min(100, 100 - (days - 1) / 29 * 100)); // 1 day = 100, 30+ days = 0
    const demand = Math.round(sp == null ? 0.65 * (l.demand ?? 50) + 0.35 * engage : 0.4 * (l.demand ?? 50) + 0.2 * engage + 0.4 * sp);
    const prox = dist == null ? 40 : Math.max(0, 100 - dist / radius * 100);
    const m = Math.min(100, Math.max(0, margin * 2));
    out.push({ ...l, resale, marginPct: Math.round(margin), demand, sellDays: days ?? null,
      distanceKm: dist == null ? null : Math.round(dist * 10) / 10,
      score: Math.round(0.45 * demand + 0.35 * m + 0.2 * prox) });
  }
  return out.sort((a, b) => b.score - a.score);
}

// Median days from posting to disappearing, per product name (needs 3+ sold/removed listings).
export function speedByName(rows) {
  const g = {};
  for (const r of rows) {
    const start = r.posted_at || r.first_seen;
    if (!start || !r.removed_at || !r.name) continue;
    const d = (new Date(r.removed_at) - new Date(start)) / 864e5;
    if (d >= 0) (g[r.name] ??= []).push(d);
  }
  const out = {};
  for (const [k, v] of Object.entries(g)) if (v.length >= 3) out[k] = Math.round(median(v) * 10) / 10;
  return out;
}
// Listings that should have shown up again but did not. Null means "too many at once, probably a failed scrape".
export function findGone(candidates, seen) {
  const gone = candidates.filter(c => !seen.has(c.hash)).map(c => c.hash);
  if (candidates.length >= 5 && gone.length / candidates.length > 0.6) return null;
  return gone;
}
