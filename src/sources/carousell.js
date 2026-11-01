import { scrapeAnchors } from "./scrape.js";
export const name = "carousell", needsBrowser = true;
export const search = (q, { browser }) =>
  scrapeAnchors(browser, `https://www.carousell.ph/search/${encodeURIComponent(q)}?sort_by=3`, { hrefRe: /\/p\// });
