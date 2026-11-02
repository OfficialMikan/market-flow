// Public Facebook group posts via Apify. Only PUBLIC groups work: private groups need a login, which this never uses.
// Posts are free text, so the AI decides whether each is for sale or wanted and pulls out item, price and area.
import { runActor } from "./apifyCore.js";
export const name = "facebook_groups", needsBrowser = false, usesApify = true, once = true;
const ACTOR = () => process.env.FB_GROUPS_ACTOR || "deepmine~facebook-groups-scraper";
const when = t => { const d = new Date(typeof t === "number" ? (t < 1e12 ? t * 1000 : t) : t); return Number.isFinite(+d) ? d.toISOString() : null; };
const img = i => { const x = i.attachments?.[0] || i.media?.[0]; const u = x?.thumbnail || x?.image?.uri || x?.photo_image?.uri || ""; return typeof u === "string" ? u : ""; };

export function mapPost(i) {
  const text = String(i.text || "").trim(), url = i.url || i.postUrl;
  if (!url || text.length < 12) return null;
  const first = text.split("\n").map(s => s.trim()).find(s => s.length >= 6) || text;
  return { kind: "post", url, title: first.slice(0, 140), price: undefined, description: text.slice(0, 2000), imageUrl: img(i), comments: +i.likesCount || 0,
    postedAt: i.time ? when(i.time) : null, locationText: "", seller: i.user?.name ? { name: i.user.name, url: i.user.profileUrl || i.user.url || "" } : null };
}
export async function scanAll({ groups }) {
  const out = [];
  for (const g of groups) {
    if (!/facebook\.com\/groups\//i.test(g)) { console.error(`  facebook_groups: skipped "${g}" (use a public group link like https://www.facebook.com/groups/name)`); continue; }
    const items = await runActor(ACTOR(), { startUrls: [{ url: g }], resultsLimit: +(process.env.GROUP_MAX_POSTS || 10), onlyPostsNewerThanHours: +(process.env.GROUP_HOURS || 8),
      viewOption: "CHRONOLOGICAL", proxyConfiguration: { useApifyProxy: true, apifyProxyGroups: ["RESIDENTIAL"], apifyProxyCountry: process.env.FB_PROXY_COUNTRY || "PH" } }, { quiet: true });
    const posts = items.map(mapPost).filter(Boolean);
    console.log(`facebook_groups ${g}: ${posts.length} posts`);
    if (items.length && !posts.length) console.error(`  DEBUG facebook_groups: ${items.length} items but none usable. First: ${JSON.stringify(items[0]).slice(0, 400)}`);
    out.push(...posts);
  }
  return out;
}
