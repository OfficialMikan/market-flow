// Cloud scouting through Apify: Apify's residential proxies fetch Carousell for you, so this runs fine
// from GitHub Actions with no computer of yours involved. Output fields follow crawloop/carousell-scraper.
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
  const token = process.env.APIFY_TOKEN;
  if (!token) throw new Error("APIFY_TOKEN is not set");
  const country = process.env.CAROUSELL_COUNTRY || "PH";
  const input = { country, searchQueries: [q], sortBy: "recent", maxItems: +(process.env.APIFY_MAX_ITEMS || 10),
    fetchDetails: false, deepPagination: false,
    proxyConfiguration: { useApifyProxy: true, apifyProxyGroups: ["RESIDENTIAL"], apifyProxyCountry: country } };
  const r = await fetch(`https://api.apify.com/v2/acts/${ACTOR()}/run-sync-get-dataset-items`, {
    method: "POST", signal: AbortSignal.timeout(290000),
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify(input) });
  if (!r.ok) throw new Error(`Apify HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return (await r.json()).map(mapItem).filter(Boolean);
}
