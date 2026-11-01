// Opens a persistent browser profile. Locally it uses your real Chrome (visible window), which sites trust far more
// than a headless server browser. The profile folder keeps cookies, so a captcha you solve once stays solved.
export async function openContext() {
  const { chromium } = await import("playwright");
  const dir = process.env.BROWSER_PROFILE || "./browser-profile";
  const opts = {
    headless: process.env.HEADLESS ? process.env.HEADLESS === "true" : !!process.env.CI,
    locale: "en-PH", timezoneId: "Asia/Manila", viewport: { width: 1280, height: 900 },
    args: ["--disable-blink-features=AutomationControlled"],
  };
  try { return await chromium.launchPersistentContext(dir, { ...opts, channel: process.env.BROWSER_CHANNEL || "chrome" }); }
  catch (e) { console.error("Real Chrome not found, using bundled Chromium:", e.message.split("\n")[0]); return chromium.launchPersistentContext(dir, opts); }
}
