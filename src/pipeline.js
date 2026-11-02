import { createHash } from "node:crypto";
import { CONFIG, TOWNS } from "./config.js";
export const FEE = 0.08; // haggling + fees: you realistically keep ~92% of the resale price
const travelRate = () => +(process.env.TRAVEL_PESO_PER_KM || 10); // pesos per km, both ways
const VARIANTS = new Set(["ti", "super", "pro", "max", "plus", "xt", "xtx", "oled", "lite", "mini", "ultra", "slim", "air", "se", "x3d"]);

export const hash = u => createHash("sha1").update(String(u).split("?")[0]).digest("hex");
export function haversine(a, b, c, d) {
  const R = 6371, r = x => x * Math.PI / 180;
  const h = Math.sin(r(c - a) / 2) ** 2 + Math.cos(r(a)) * Math.cos(r(c)) * Math.sin(r(d - b) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
export function distanceFor(l, home = CONFIG.home) {
  if (l.lat != null && l.lng != null) return haversine(home.lat, home.lng, l.lat, l.lng);
  const t = `${l.locationText || ""} ${l.area || ""}`.toLowerCase();
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
    if (!l.url || (!(l.price > 0) && l.kind !== "post")) continue; // group posts may get their price from the AI later
    const h = hash(l.url);
    if (!seen.has(h)) seen.set(h, { ...l, hash: h });
  }
  return [...seen.values()];
}
// Remove phone numbers, emails and links from anything that will be public.
export const redact = s => String(s ?? "").replace(/https?:\/\/\S+/g, "").replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, "")
  .replace(/(?:\+?63|0)?\s?9\d{2}[\s.-]?\d{3}[\s.-]?\d{4}/g, "").replace(/\b\d{9,}\b/g, "").replace(/\s{2,}/g, " ").trim();

export const tokens = name => String(name || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(Boolean);
// Same product = similar words, same variant words (ti, pro, oled...) and the same model numbers.
export function sameProduct(a, b) {
  const A = new Set(tokens(a)), B = new Set(tokens(b));
  if (!A.size || !B.size) return false;
  const inter = [...A].filter(t => B.has(t)).length, jac = inter / (A.size + B.size - inter);
  const pick = (S, f) => [...S].filter(f).sort().join();
  const isV = t => VARIANTS.has(t), isN = t => /\d/.test(t);
  const na = pick(A, isN), nb = pick(B, isN);
  return jac >= 0.6 && pick(A, isV) === pick(B, isV) && (!na || !nb || na === nb);
}
export function sellerScore(s) {
  if (!s) return null;
  const r = +s.rating, n = +s.reviews, y = +s.tenureYears;
  if (!(r > 0) && !(n > 0) && !(y > 0)) return null;
  return Math.round((r > 0 ? Math.min(60, r / 5 * 60) : 30) + (n > 0 ? Math.min(25, Math.log10(1 + n) / Math.log10(101) * 25) : 0) + (y > 0 ? Math.min(15, y * 3) : 0));
}
// Buyers = "wanted" posts for the same product whose budget leaves room for profit (or that state no budget).
export function findBuyers(l, wanted) {
  const out = [];
  for (const w of wanted) {
    if (w.url === l.url || !sameProduct(l.name, w.name)) continue;
    if (w.budget != null && !(w.budget > l.price * 1.05)) continue;
    out.push({ url: w.url, budget: w.budget, area: w.area || "", at: w.at || null });
  }
  return out.sort((a, b) => (b.budget ?? -1) - (a.budget ?? -1)).slice(0, 3);
}
// What you would net by buying this and selling it on. Confidence: A buyer found, B sold comps, C asking comps, D AI guess.
export function opportunity(l, { askMedian, soldMedian, buyers }, dist) {
  const budgets = (buyers || []).map(b => b.budget).filter(x => x > 0);
  const comp = soldMedian != null ? soldMedian : askMedian != null ? askMedian * 0.95 : null;
  let sell = null, basis = null, conf = null;
  if (budgets.length) { const b = Math.max(...budgets); sell = comp != null ? Math.min(b, comp * 1.05) : b; basis = "buyer"; conf = "A"; }
  else if (soldMedian != null) { sell = soldMedian; basis = "sold"; conf = "B"; }
  else if (askMedian != null) { sell = askMedian * 0.95; basis = "asking"; conf = "C"; }
  else if (l.resale > 0) { sell = l.resale * 0.9; basis = "ai"; conf = "D"; }
  if (sell == null) return {};
  sell *= 1 - [0, 0.08, 0.25][l.issueLevel || 0];
  const travel = dist == null ? 0 : dist * 2 * travelRate();
  const net = sell * (1 - FEE) - l.price - travel;
  return { sellPrice: Math.round(sell), sellBasis: basis, confidence: conf, net: Math.round(net), roi: Math.round(net / l.price * 100), travel: Math.round(travel) };
}
export function rank(list, radius = CONFIG.radiusKm, market = {}) {
  const speed = market.speed || {}, sold = market.soldPrice || {};
  const sells = list.filter(l => l.intent !== "wanted"), wants = list.filter(l => l.intent === "wanted");
  const groups = {};
  for (const l of sells) (groups[l.name] ??= []).push(l.price);
  const pool = new Map();
  for (const r of market.wanted || []) pool.set(r.url, { url: r.url, name: r.name, budget: r.price == null ? null : +r.price, area: r.area || "", at: r.posted_at || r.first_seen || null });
  for (const l of wants) pool.set(l.url, { url: l.url, name: l.name, budget: l.price > 0 ? l.price : null, area: l.area || "", at: l.postedAt || null });
  const wantedPool = [...pool.values()], out = [];
  for (const l of sells) {
    if (l.flag) continue;
    const dist = distanceFor(l);
    if (dist != null && dist > radius) continue;
    const g = groups[l.name], buyers = findBuyers(l, wantedPool), days = speed[l.name];
    const sp = days == null ? null : Math.max(0, Math.min(100, 100 - (days - 1) / 29 * 100)); // 1 day = 100, 30+ days = 0
    const engage = Math.min(100, (l.comments || 0) * 5 + (l.likes || 0) * 4), base = l.demand ?? 50;
    const demand = Math.min(100, Math.round((sp == null ? 0.65 * base + 0.35 * engage : 0.4 * base + 0.2 * engage + 0.4 * sp) + Math.min(10, buyers.length * 5)));
    const askMedian = g.length >= 3 ? median(g) : null, soldMedian = sold[l.name] ?? null;
    const op = opportunity(l, { askMedian, soldMedian, buyers }, dist);
    const comp = soldMedian != null ? soldMedian : askMedian != null ? askMedian * 0.95 : null; // market price ceiling a buyer will really pay
    const roi = op.roi ?? 0, net = op.net ?? null;
    const prox = dist == null ? 40 : Math.max(0, 100 - dist / radius * 100);
    const cw = { A: 1, B: 0.85, C: 0.65, D: 0.4 }[op.confidence] ?? 0.4;
    const raw = 0.35 * Math.min(100, Math.max(0, roi * 2)) + 0.25 * (net == null ? 0 : Math.min(100, Math.max(0, net / 15))) + 0.25 * demand + 0.15 * prox;
    let offer = Math.round(l.price * 0.9 / 50) * 50; // opening offer: 90%, or the price that still leaves 25% return
    if (op.sellPrice) offer = Math.max(Math.round(Math.min(l.price * 0.9, (op.sellPrice * (1 - FEE) - (op.travel || 0)) / 1.25) / 50) * 50, Math.round(l.price * 0.6 / 50) * 50);
    if (!(offer > 0)) offer = l.price;
    out.push({ ...l, resale: op.sellPrice ?? null, sellPrice: op.sellPrice ?? null, sellBasis: op.sellBasis ?? null, confidence: op.confidence ?? null,
      net, travel: op.travel ?? 0, _cap: comp == null ? null : comp * 1.05, marginPct: roi, demand, sellDays: days ?? null, offerPrice: Math.min(offer, l.price), matches: buyers,
      distanceKm: dist == null ? null : Math.round(dist * 10) / 10, score: Math.round(raw * (0.5 + 0.5 * cw)) });
  }
  const supply = new Map();
  for (const r of market.supply || []) supply.set(r.url, { hash: r.hash, url: r.url, title: r.title, name: r.name, price: +r.price, dist: r.distance_km == null ? null : +r.distance_km, cap: sold[r.name] != null ? sold[r.name] * 1.05 : null });
  for (const s of out) supply.set(s.url, { hash: s.hash, url: s.url, title: s.title, name: s.name, price: s.price, dist: s.distanceKm, cap: s._cap ?? null });
  for (const l of wants) { // buyers asking: which seller could fill this request, and what you would net
    const dist = distanceFor(l);
    if (dist != null && dist > radius) continue;
    const budget = l.price > 0 ? l.price : null;
    const matches = [...supply.values()].filter(s => sameProduct(s.name, l.name) && (budget == null || budget > s.price * 1.05))
      .map(s => ({ hash: s.hash, url: s.url, title: s.title, price: s.price, net: budget == null ? null : Math.round((s.cap != null ? Math.min(budget, s.cap) : budget) * (1 - FEE) - s.price - (s.dist == null ? 0 : s.dist * 2 * travelRate())) }))
      .filter(m => m.net == null || m.net > 0).sort((a, b) => (b.net ?? -1e9) - (a.net ?? -1e9) || a.price - b.price).slice(0, 3);
    const bestNet = matches.find(m => m.net != null)?.net ?? null, demand = Math.min(100, Math.round(l.demand ?? 60));
    out.push({ ...l, price: budget, resale: null, sellPrice: budget, sellBasis: "buyer", confidence: matches.length ? "A" : null, net: bestNet, marginPct: 0,
      demand, sellDays: null, matches, distanceKm: dist == null ? null : Math.round(dist * 10) / 10,
      score: Math.round(0.5 * demand + 0.5 * Math.min(100, Math.max(0, bestNet ?? 0) / 10)) });
  }
  return out.sort((a, b) => b.score - a.score);
}
function groupBy(rows, key, val) {
  const g = {};
  for (const r of rows) { const k = r[key], v = val(r); if (k && v != null) (g[k] ??= []).push(v); }
  return g;
}
// Median days from posting to disappearing, per product name (needs 3+ sold/removed listings).
export function speedByName(rows) {
  const g = groupBy(rows.filter(r => (r.posted_at || r.first_seen) && r.removed_at), "name", r => {
    const d = (new Date(r.removed_at) - new Date(r.posted_at || r.first_seen)) / 864e5; return d >= 0 ? d : null; });
  return Object.fromEntries(Object.entries(g).filter(([, v]) => v.length >= 3).map(([k, v]) => [k, Math.round(median(v) * 10) / 10]));
}
// Median asking price of listings that later disappeared: the closest thing to a real sold price.
export function soldMedianByName(rows) {
  const g = groupBy(rows.filter(r => r.removed_at && r.intent !== "wanted"), "name", r => +r.price > 0 ? +r.price : null);
  return Object.fromEntries(Object.entries(g).filter(([, v]) => v.length >= 3).map(([k, v]) => [k, Math.round(median(v))]));
}
// Listings that should have shown up again but did not. Null means "too many at once, probably a failed scrape".
export function findGone(candidates, seen) {
  const gone = candidates.filter(c => !seen.has(c.hash)).map(c => c.hash);
  if (candidates.length >= 5 && gone.length / candidates.length > 0.6) return null;
  return gone;
}
// Which listings deserve a paid detail fetch: the ones priced well below their search's median.
export function pickForDetails(list, n, sources) {
  const g = {};
  for (const l of list) if (l.kind !== "post" && sources.includes(l.source)) (g[`${l.source}|${l.q}`] ??= []).push(l);
  const c = [];
  for (const arr of Object.values(g)) {
    if (arr.length < 3) continue;
    const m = median(arr.map(x => x.price));
    for (const l of arr) if (l.price / m <= 0.9) c.push({ l, ratio: l.price / m });
  }
  return c.sort((a, b) => a.ratio - b.ratio).slice(0, n).map(x => x.l);
}
