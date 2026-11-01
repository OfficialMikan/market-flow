import { readFileSync, existsSync } from "node:fs";
import { scrapeAnchors } from "./scrape.js";
// Add any site by editing sources.json: no code needed. It works on sites whose result cards are links that show a price.
export function loadCustom(file = "sources.json") {
  if (!existsSync(file)) return {};
  const out = {};
  for (const s of JSON.parse(readFileSync(file, "utf8"))) {
    out[s.name] = { name: s.name, needsBrowser: true,
      search: (q, { ctx }) => scrapeAnchors(ctx, s.url.replace("{q}", encodeURIComponent(q)), { hrefRe: new RegExp(s.hrefRe), selector: s.selector }) };
  }
  return out;
}
