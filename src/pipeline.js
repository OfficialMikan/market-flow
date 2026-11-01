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
export function rank(list, radius = CONFIG.radiusKm) {
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
    const engage = Math.min(100, (l.comments || 0) * 12 + (l.likes || 0) * 4);
    const demand = Math.round(0.65 * (l.demand ?? 50) + 0.35 * engage);
    const prox = dist == null ? 40 : Math.max(0, 100 - dist / radius * 100);
    const m = Math.min(100, Math.max(0, margin * 2));
    out.push({ ...l, resale, marginPct: Math.round(margin), demand,
      distanceKm: dist == null ? null : Math.round(dist * 10) / 10,
      score: Math.round(0.45 * demand + 0.35 * m + 0.2 * prox) });
  }
  return out.sort((a, b) => b.score - a.score);
}
