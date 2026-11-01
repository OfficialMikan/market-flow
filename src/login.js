import { openContext } from "./browser.js";
// Run once: npm run login. Open the sites, pass any "are you human" check, then close the window.
const ctx = await openContext();
const page = ctx.pages()[0] || await ctx.newPage();
await page.goto("https://www.carousell.ph/").catch(() => {});
console.log("Browse the site, solve any check, then close the browser window.");
await new Promise(r => ctx.on("close", r));
