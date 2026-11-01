// Facebook Marketplace via Apify (public listings, no Facebook login or cookies of yours involved).
// FB_LOCATION = the place segment of a Marketplace URL, e.g. facebook.com/marketplace/<THIS>/search/?query=x
import { runActor, toPrice, noteUnmapped } from "./apifyCore.js";
export const name = "facebook_marketplace", needsBrowser = false;
const ACTOR = () => process.env.FB_ACTOR || "deepmine~facebook-marketplace-scraper";
const num = v => (v === null || v === undefined || v === "" || !Number.isFinite(+v)) ? undefined : +v;

export function mapItem(i) {
  const price = toPrice(i.priceAmount ?? i.priceFormatted);
  const url = i.listingUrl || i.itemUrl;
  if (!url || !(price > 0) || i.isSold) return null;
  return { url, title: String(i.listingTitle || i.title || "").slice(0, 140), price, imageUrl: i.primaryPhotoUrl || "",
    comments: 0, postedAt: i.createdAt || null, lat: num(i.latitude), lng: num(i.longitude),
    locationText: [i.locationText, i.city, i.state].filter(Boolean).join(" ") };
}
export async function search(q) {
  const location = process.env.FB_LOCATION;
  if (!location) throw new Error("FB_LOCATION is not set. Add it in GitHub under Settings > Secrets and variables > Actions (as a Variable or a Secret, named exactly FB_LOCATION). Value: open facebook.com/marketplace, choose your city, and copy the part after /marketplace/ in the address bar.");
  const items = await runActor(ACTOR(), { searchKeyword: q, location, radiusKm: +(process.env.FB_RADIUS_KM || 25),
    resultsLimit: +(process.env.FB_MAX_ITEMS || 10), includeListingDetails: false,
    proxyConfiguration: { useApifyProxy: true, apifyProxyGroups: ["RESIDENTIAL"], apifyProxyCountry: process.env.FB_PROXY_COUNTRY || "PH" } });
  const out = items.map(mapItem).filter(Boolean);
  noteUnmapped(name, items, out);
  return out;
}
