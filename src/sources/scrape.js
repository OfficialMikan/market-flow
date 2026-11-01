import { mkdirSync } from "node:fs";
const PRICE = /(?:₱|PHP|Php)\s?([\d,]+(?:\.\d+)?)/;
const AGO = /(\d+)\s*(min|hour|hr|day|week|month)/i;
const MS = { min: 6e4, hour: 36e5, hr: 36e5, day: 864e5, week: 6048e5, month: 2592e6 };
const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

export function parse({ url, text, img }) {
  const lines = text.split("\n").map(s => s.trim()).filter(Boolean);
  const pl = lines.find(l => PRICE.test(l));
  if (!pl) return null;
  const price = +PRICE.exec(pl)[1].replace(/,/g, "");
  const ago = lines.map(l => AGO.exec(l)).find(Boolean);
  const title = lines.filter(l => !PRICE.test(l) && !AGO.test(l) && l.length >= 6).sort((a, b) => b.length - a.length)[0];
  if (!title) return null;
  return { url, title: title.slice(0, 140), price, imageUrl: img, locationText: lines.join(" "),
    postedAt: ago ? new Date(Date.now() - ago[1] * MS[ago[2].toLowerCase()]).toISOString() : null };
}
// Generic card reader: finds listing links by URL pattern, so it survives CSS class changes.
// When it finds nothing it logs what the page looked like and saves a screenshot to debug/.
export async function scrapeAnchors(ctx, url, { hrefRe, selector }) {
  const page = await ctx.newPage();
  try {
    const resp = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.waitForSelector(selector, { timeout: 15000 }).catch(() => {});
    await page.mouse.wheel(0, 5000);
    await page.waitForTimeout(2000);
    const raw = await page.$$eval("a[href]", (as, src) => {
      const re = new RegExp(src);
      return as.filter(a => re.test(a.getAttribute("href") || ""))
        .map(a => ({ url: a.href, text: a.innerText || "", img: a.querySelector("img")?.src || "" }));
    }, hrefRe.source);
    const parsed = raw.map(parse).filter(Boolean);
    if (!parsed.length) {
      const title = await page.title();
      const body = (await page.evaluate(() => document.body?.innerText || "")).replace(/\s+/g, " ").slice(0, 200);
      console.error(`  DEBUG links=${raw.length} parsed=0 status=${resp?.status()} title="${title}" text="${body}"`);
      mkdirSync("debug", { recursive: true });
      await page.screenshot({ path: `debug/${Date.now()}.png` }).catch(() => {});
    }
    return parsed;
  } finally { await page.close(); }
}
