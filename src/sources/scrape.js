const PRICE = /(?:₱|PHP|Php)\s?([\d,]+(?:\.\d+)?)/;
const AGO = /(\d+)\s*(min|hour|hr|day|week|month)/i;
const MS = { min: 6e4, hour: 36e5, hr: 36e5, day: 864e5, week: 6048e5, month: 2592e6 };

export function parse({ url, text, img }) {
  const lines = text.split("\n").map(s => s.trim()).filter(Boolean);
  const pl = lines.find(l => PRICE.test(l));
  if (!pl) return null;
  const price = +PRICE.exec(pl)[1].replace(/,/g, "");
  const ago = lines.map(l => AGO.exec(l)).find(Boolean);
  const title = lines.filter(l => !PRICE.test(l) && !AGO.test(l) && l.length >= 6).sort((a, b) => b.length - a.length)[0];
  if (!title) return null;
  return { url, title, price, imageUrl: img, locationText: "",
    postedAt: ago ? new Date(Date.now() - ago[1] * MS[ago[2].toLowerCase()]).toISOString() : null };
}
// Generic card reader: finds listing links by URL pattern, so it survives CSS class changes.
export async function scrapeAnchors(browser, url, { hrefRe }) {
  const page = await browser.newPage({ locale: "en-PH", viewport: { width: 1280, height: 900 } });
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.waitForTimeout(4000);
    await page.mouse.wheel(0, 5000);
    await page.waitForTimeout(1500);
    const raw = await page.$$eval("a[href]", (as, src) => {
      const re = new RegExp(src);
      return as.filter(a => re.test(a.getAttribute("href") || ""))
        .map(a => ({ url: a.href, text: a.innerText || "", img: a.querySelector("img")?.src || "" }));
    }, hrefRe.source);
    return raw.map(parse).filter(Boolean);
  } finally { await page.close(); }
}
