// EXPERIMENTAL: Shopee blocks bots aggressively. Prefer Shopee's affiliate/open API when you can.
import { scrapeAnchors } from "./scrape.js";
export const name = "shopee", needsBrowser = true;
export const search = (q, { browser }) =>
  scrapeAnchors(browser, `https://shopee.ph/search?keyword=${encodeURIComponent(q)}&sortBy=ctime`, { hrefRe: /-i\.\d+\.\d+/, selector: 'a[href*="-i."]' });
