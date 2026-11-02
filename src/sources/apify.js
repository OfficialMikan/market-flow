// Cloud scouting through Apify (crawloop/carousell-scraper). It needs a residential proxy in the Philippines: without one it returns 0 results.
import { runActor, toPrice, noteUnmapped } from "./apifyCore.js";
import { hash } from "../pipeline.js";
export const name = "carousell_apify", needsBrowser = false, usesApify = true, recencySorted = true;
const ACTOR = () => process.env.APIFY_ACTOR || "crawloop~carousell-scraper";
const proxy = c => ({ useApifyProxy: true, apifyProxyGroups: ["RESIDENTIAL"], apifyProxyCountry: c });

export function mapItem(i) {
  const price = toPrice(i.price ?? i.priceAmount ?? i.priceFormatted);
  const url = i.url || i.listingUrl;
  if (!url || !(price > 0) || i.isSold) return null;
  const s = i.seller && typeof i.seller === "object" ? i.seller : null;
  return { kind: "listing", url, title: String(i.title || i.name || "").slice(0, 140), price,
    imageUrl: i.imageUrl || i.images?.[0] || "", images: Array.isArray(i.images) ? i.images.slice(0, 6) : [], comments: +i.likesCount || 0, postedAt: i.listedAt || null,
    locationText: [i.location, i.meetupLocation].filter(Boolean).join(" "), meetup: i.meetupLocation || "", description: i.description || "",
    conditionRaw: i.condition || "", attributes: i.attributes || null, negotiable: typeof i.isNegotiable === "boolean" ? i.isNegotiable : null,
    seller: s ? { name: s.username || s.name || "", url: s.url || "", rating: +s.rating || null, reviews: +s.reviewCount || null, tenureYears: +s.tenureYears || null } : null };
}
export async function search(q) {
  const country = process.env.CAROUSELL_COUNTRY || "PH";
  const items = await runActor(ACTOR(), { country, searchQueries: [q], sortBy: "recent", maxItems: +(process.env.APIFY_MAX_ITEMS || 10),
    fetchDetails: false, deepPagination: false, proxyConfiguration: proxy(country) });
  const out = items.map(mapItem).filter(Boolean);
  noteUnmapped(name, items, out);
  return out;
}
// Full description, attributes and seller reputation for specific listings.
export async function details(urls) {
  const country = process.env.CAROUSELL_COUNTRY || "PH";
  const items = await runActor(ACTOR(), { country, startUrls: urls.map(url => ({ url })), fetchDetails: true, maxItems: urls.length, deepPagination: false, proxyConfiguration: proxy(country) }, { quiet: true });
  const m = new Map();
  for (const i of items) { const d = mapItem(i); if (d) m.set(hash(d.url), d); }
  return m;
}
