// Facebook Marketplace via Apify (public listings, no Facebook login or cookies of yours involved).
// FB_LOCATION = the place segment of a Marketplace URL, e.g. facebook.com/marketplace/<THIS>/search/?query=x
import { runActor } from "./apifyCore.js";
export const name = "facebook_marketplace", needsBrowser = false;
const ACTOR = () => process.env.FB_ACTOR || "deepmine~facebook-marketplace-scraper";
const num = v => (v === null || v === undefined || v === "" || !Number.isFinite(+v)) ? undefined : +v;

export function mapItem(i) {
  const price = +i.priceAmount;
  if (!i.listingUrl || !(price > 0) || i.isSold) return null;
  return { url: i.listingUrl, title: String(i.listingTitle || "").slice(0, 140), price, imageUrl: i.primaryPhotoUrl || "",
    comments: 0, postedAt: i.createdAt || null, lat: num(i.latitude), lng: num(i.longitude),
    locationText: [i.locationText, i.city, i.state].filter(Boolean).join(" ") };
}
export async function search(q) {
  const location = process.env.FB_LOCATION;
  if (!location) throw new Error("FB_LOCATION is not set. Open facebook.com/marketplace, choose your city, and copy the part after /marketplace/ in the address bar.");
  const items = await runActor(ACTOR(), { searchKeyword: q, location, radiusKm: +(process.env.FB_RADIUS_KM || 25),
    resultsLimit: +(process.env.FB_MAX_ITEMS || 15), includeListingDetails: false,
    proxyConfiguration: { useApifyProxy: true, apifyProxyGroups: ["RESIDENTIAL"], apifyProxyCountry: process.env.FB_PROXY_COUNTRY || "PH" } });
  return items.map(mapItem).filter(Boolean);
}
