// Cloud scouting through Apify: Apify's residential proxies fetch Carousell for you, so this runs fine
// from GitHub Actions with no computer of yours involved. Output fields follow crawloop/carousell-scraper.
import { runActor } from "./apifyCore.js";
export const name = "carousell_apify", needsBrowser = false;
const ACTOR = () => process.env.APIFY_ACTOR || "crawloop~carousell-scraper";

export function mapItem(i) {
  const price = +i.price;
  if (!i.url || !(price > 0) || i.isSold) return null;
  return { url: i.url, title: String(i.title || "").slice(0, 140), price,
    imageUrl: i.imageUrl || i.images?.[0] || "", comments: +i.likesCount || 0, postedAt: i.listedAt || null,
    locationText: [i.location, i.meetupLocation].filter(Boolean).join(" ") };
}
export async function search(q) {
  const country = process.env.CAROUSELL_COUNTRY || "PH";
  const items = await runActor(ACTOR(), { country, searchQueries: [q], sortBy: "recent", maxItems: +(process.env.APIFY_MAX_ITEMS || 10),
    fetchDetails: false, deepPagination: false,
    proxyConfiguration: { useApifyProxy: true, apifyProxyGroups: ["RESIDENTIAL"], apifyProxyCountry: country } });
  return items.map(mapItem).filter(Boolean);
}
