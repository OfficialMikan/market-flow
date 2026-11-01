import { scrapeAnchors } from "./scrape.js";
export const name = "carousell", needsBrowser = true;
export const search = (q, { ctx }) =>
  scrapeAnchors(ctx, `https://www.carousell.ph/search/${encodeURIComponent(q)}?sort_by=3`, { hrefRe: /\/p\//, selector: 'a[href*="/p/"]' });
