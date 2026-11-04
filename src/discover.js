// Automatic Facebook group finder: Google finds PUBLIC groups near you, each is checked on a few recent posts, good ones are switched on.
import { runActor } from "./sources/apifyCore.js";
import { mapPost } from "./sources/groups.js";
import { matchPlace, nearbyPlaces } from "./geo.js";
import { haversine } from "./pipeline.js";
const SKIP = new Set(["feed", "discover", "joins", "create", "search", "categories", "notifications"]);
const proxy = () => ({ useApifyProxy: true, apifyProxyGroups: ["RESIDENTIAL"], apifyProxyCountry: process.env.FB_PROXY_COUNTRY || "PH" });
export function groupUrls(items) {
  const out = new Map(), add = u => { const m = /facebook\.com\/groups\/([A-Za-z0-9._-]+)/i.exec(String(u || "")); if (m && !SKIP.has(m[1].toLowerCase())) out.set(m[1].toLowerCase(), `https://www.facebook.com/groups/${m[1]}`); };
  for (const i of items) { add(i.url); for (const o of i.organicResults || []) add(o.url); }
  return [...out.values()];
}
export const discoveryQueries = places => places.flatMap(p => [`site:facebook.com/groups "buy and sell" ${p}`, `site:facebook.com/groups gadgets computer ${p}`]).slice(0, 6);
const SELL = /₱|\bphp\b|\bp\s?\d{3,}|selling|for sale|\bwts\b|brand new|negotiable|\bnfa\b|meet ?up|\bprice\b/i;
export function scoreGroup(posts, home) {
  const n = posts.length;
  if (!n) return { postsSeen: 0, sellRatio: 0, localRatio: 0, score: 0 };
  let sell = 0, local = 0;
  for (const p of posts) {
    const t = `${p.title} ${p.description || ""}`;
    if (SELL.test(t)) sell++;
    const m = matchPlace(t, home);
    if (m && haversine(home.lat, home.lng, m.la, m.lo) <= 60) local++;
  }
  return { postsSeen: n, sellRatio: +(sell / n).toFixed(2), localRatio: +(local / n).toFixed(2), score: +(0.5 * sell / n + 0.3 * local / n + 0.2 * Math.min(1, n / 10)).toFixed(2) };
}
export async function discover(home) {
  const items = await runActor(process.env.DISCOVER_ACTOR || "santamaria-automations~google-search-scraper",
    { queries: discoveryQueries(nearbyPlaces(home, 3)), countryCode: "ph", maxPagesPerQuery: 1 }, { quiet: true });
  return groupUrls(items);
}
export async function evaluate(url, home) {
  const items = await runActor(process.env.FB_GROUPS_ACTOR || "deepmine~facebook-groups-scraper",
    { startUrls: [{ url }], resultsLimit: 12, onlyPostsNewerThanHours: 336, viewOption: "CHRONOLOGICAL", proxyConfiguration: proxy() }, { quiet: true });
  const sc = scoreGroup(items.map(mapPost).filter(Boolean), home), ok = sc.postsSeen >= 5 && sc.score >= 0.45;
  return { ...sc, status: ok ? "active" : "rejected", reason: ok ? "" : sc.postsSeen < 5 ? "private, empty or inactive" : "mostly not for sale or not local" };
}
