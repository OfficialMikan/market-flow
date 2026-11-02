// Facebook Marketplace via Apify (public listings, no Facebook login or cookies of yours involved).
// FB_LOCATION = the place segment of a Marketplace URL, e.g. facebook.com/marketplace/<THIS>/search/?query=x
import { runActor, toPrice, noteUnmapped, yearsSince } from "./apifyCore.js";
import { hash } from "../pipeline.js";
export const name = "facebook_marketplace", needsBrowser = false, usesApify = true;
const ACTOR = () => process.env.FB_ACTOR || "deepmine~facebook-marketplace-scraper";
const num = v => (v === null || v === undefined || v === "" || !Number.isFinite(+v)) ? undefined : +v;
const proxy = () => ({ useApifyProxy: true, apifyProxyGroups: ["RESIDENTIAL"], apifyProxyCountry: process.env.FB_PROXY_COUNTRY || "PH" });

export function mapItem(i) {
  const price = toPrice(i.priceAmount ?? i.priceFormatted);
  const url = i.listingUrl || i.itemUrl;
  if (!url || !(price > 0) || i.isSold) return null;
  const photos = (Array.isArray(i.listingPhotos) ? i.listingPhotos : []).map(p => typeof p === "string" ? p : (p?.url || p?.uri || "")).filter(Boolean).slice(0, 6);
  return { kind: "listing", url, title: String(i.listingTitle || i.title || "").slice(0, 140), price, imageUrl: i.primaryPhotoUrl || photos[0] || "", images: photos,
    comments: 0, postedAt: i.createdAt || null, lat: num(i.latitude), lng: num(i.longitude),
    locationText: [i.locationText, i.city, i.state].filter(Boolean).join(" "), description: i.description || "", conditionRaw: i.condition || "",
    attributes: i.listingAttributes || null, oldPrice: toPrice(i.strikethroughPrice) || null,
    seller: i.sellerName ? { name: i.sellerName, url: i.sellerUrl || "", rating: +i.sellerRatingAverage || null, reviews: +i.sellerRatingCount || null, tenureYears: yearsSince(i.sellerJoinTime) } : null };
}
export async function search(q) {
  const location = process.env.FB_LOCATION;
  if (!location) throw new Error("FB_LOCATION is not set. Add it in GitHub under Settings > Secrets and variables > Actions (as a Variable or a Secret, named exactly FB_LOCATION). Value: open facebook.com/marketplace, choose your city, and copy the part after /marketplace/ in the address bar.");
  const items = await runActor(ACTOR(), { searchKeyword: q, location, radiusKm: +(process.env.FB_RADIUS_KM || 25),
    resultsLimit: +(process.env.FB_MAX_ITEMS || 8), includeListingDetails: false, proxyConfiguration: proxy() });
  const out = items.map(mapItem).filter(Boolean);
  noteUnmapped(name, items, out);
  return out;
}
// Description, condition, coordinates, all photos and seller rating for specific listings ($1.99 per 1,000 extra).
export async function details(urls) {
  const items = await runActor(ACTOR(), { startUrls: urls.map(url => ({ url })), includeListingDetails: true, getAllListingPhotos: true, resultsLimit: 1, proxyConfiguration: proxy() }, { quiet: true });
  const m = new Map();
  for (const i of items) { const d = mapItem(i); if (d) m.set(hash(d.url), d); }
  return m;
}
