import assert from "node:assert/strict";
import { haversine, dedupe, rank } from "./pipeline.js";
import { heuristic } from "./ai.js";
import { parse } from "./sources/scrape.js";
import * as mock from "./sources/mock.js";

const d = haversine(15.2147, 120.6586, 15.145, 120.5887);
assert.ok(d > 9 && d < 13, "distance " + d);
const p = parse({ url: "https://x/p/1", text: "Rina\nMechanical keyboard 75% RGB\n₱1,100\n2 days ago", img: "" });
assert.equal(p.price, 1100); assert.equal(p.title, "Mechanical keyboard 75% RGB");
const raw = [...await mock.search("a"), ...await mock.search("b")];
const u = dedupe(raw); assert.equal(u.length, raw.length / 2);
const ranked = rank(u.map(heuristic));
assert.equal(ranked[0].price, 1100, "cheapest keyboard should rank first");
assert.ok(ranked.every(r => !/tarlac/i.test(r.locationText)), "out-of-radius item must be dropped");
console.log("all tests passed");

// Fallback chain: first provider fails with 429, second answers.
process.env.GEMINI_API_KEY = "a"; process.env.GROQ_API_KEY = "b";
const realFetch = globalThis.fetch; let calls = [];
globalThis.fetch = async (url) => {
  calls.push(url);
  if (url.includes("generativelanguage")) return { ok: false, status: 429 };
  return { ok: true, json: async () => ({ choices: [{ message: { content: '```json\n[{"i":0,"name":"switch joy-con","category":"Gaming","resale":3300,"demand":90,"flag":null}]\n```' } }] }) };
};
const { enrich } = await import("./ai.js");
const e = await enrich([{ title: "Joy-Con pair", price: 2400 }]);
assert.equal(calls.length, 2); assert.equal(e[0].name, "switch joy-con"); assert.equal(e[0].resale, 3300);
globalThis.fetch = realFetch;
console.log("fallback test passed");

// Alerts: discord + ntfy both fire, deal marked alerted.
process.env.DISCORD_WEBHOOK_URL = "https://discord.test/hook"; process.env.NTFY_TOPIC = "t";
const { alertDeals } = await import("./alerts.js");
const hits = []; globalThis.fetch = async (url, o) => { hits.push([url, JSON.parse(o.body)]); return { ok: true }; };
let marked = null; const fakeSb = { from: () => ({ update: () => ({ in: async (_c, h) => { marked = h; } }) }) };
await alertDeals([{ hash: "h1", title: "Joy-Con", price: 2400, resale: 3300, marginPct: 26, demand: 90, distanceKm: 3, score: 88, url: "https://x/p/1" }], fakeSb);
assert.equal(hits.length, 2); assert.ok(hits[0][1].content.includes("₱2400")); assert.equal(hits[1][1].topic, "t"); assert.deepEqual(marked, ["h1"]);
globalThis.fetch = realFetch;
console.log("alerts test passed");

const { loadCustom } = await import("./sources/custom.js");
assert.ok(typeof loadCustom("sources.json").lazada.search === "function");
console.log("custom sources test passed");

// Apify source: maps items, skips sold, sends auth + PH input.
process.env.APIFY_TOKEN = "tok";
const apify = await import("./sources/apify.js");
let seen = null;
globalThis.fetch = async (url, o) => { seen = { url, o }; return { ok: true, json: async () => [
  { url: "https://www.carousell.ph/p/a-1/", title: "Switch OLED", price: 10500, imageUrl: "https://i/1.jpg", location: "Angeles", likesCount: 4, isSold: false, listedAt: "2026-11-01T01:00:00Z" },
  { url: "https://www.carousell.ph/p/b-2/", title: "Sold thing", price: 100, isSold: true }] }; };
const got = await apify.search("nintendo switch");
assert.equal(got.length, 1); assert.equal(got[0].locationText, "Angeles"); assert.equal(got[0].comments, 4);
assert.equal(seen.o.headers.authorization, "Bearer tok");
const sent = JSON.parse(seen.o.body); assert.equal(sent.country, "PH"); assert.deepEqual(sent.searchQueries, ["nintendo switch"]);
globalThis.fetch = realFetch;
console.log("apify test passed");

// Facebook source + empty-run diagnostics
process.env.FB_LOCATION = "angeles-city";
const fb = await import("./sources/facebook.js");
let fbBody = null;
globalThis.fetch = async (url, o) => { fbBody = JSON.parse(o.body); return { ok: true, json: async () => [
  { listingUrl: "https://www.facebook.com/marketplace/item/1/", listingTitle: "PS5 controller", priceAmount: 1800, primaryPhotoUrl: "https://i/p.jpg", locationText: "Angeles, Pampanga", createdAt: "2026-11-01T02:00:00Z", isSold: false },
  { listingUrl: "https://www.facebook.com/marketplace/item/2/", listingTitle: "Free chair", priceAmount: 0 }] }; };
const fbr = await fb.search("ps5");
assert.equal(fbr.length, 1); assert.equal(fbr[0].lat, undefined); assert.ok(fbr[0].locationText.includes("Pampanga"));
assert.equal(fbBody.location, "angeles-city"); assert.equal(fbBody.searchKeyword, "ps5"); assert.equal(fbBody.radiusKm, 25);
delete process.env.FB_LOCATION; await assert.rejects(fb.search("x"), /FB_LOCATION/);
const errs = []; const origErr = console.error; console.error = (...a) => errs.push(a.join(" "));
globalThis.fetch = async (url) => url.includes("run-sync") ? { ok: true, json: async () => [] }
  : url.includes("/runs/last") ? { json: async () => ({ data: { id: "r1", status: "SUCCEEDED", statusMessage: "0 items", usageTotalUsd: 0.01 } }) }
  : { text: async () => "line one\nProxy error: residential not allowed\n" };
const { runActor } = await import("./sources/apifyCore.js");
assert.deepEqual(await runActor("a~b", {}), []);
console.error = origErr;
assert.ok(errs.some(e => e.includes("status=SUCCEEDED")) && errs.some(e => e.includes("Proxy error")), "diagnostics printed");
globalThis.fetch = realFetch;
console.log("facebook + diagnostics test passed");

// Tolerant mapping + unusable-items diagnostic
const ap = await import("./sources/apify.js");
assert.equal(ap.mapItem({ url: "https://c/p/1", title: "x", price: "PHP 1,200" }).price, 1200);
assert.equal(ap.mapItem({ listingUrl: "https://c/p/2", name: "y", priceFormatted: "₱2,500" }).price, 2500);
const e2 = []; const oe = console.error; console.error = (...a) => e2.push(a.join(" "));
process.env.APIFY_TOKEN = "t";
globalThis.fetch = async () => ({ ok: true, json: async () => [{ weird: "shape", cost: 5 }] });
assert.deepEqual(await ap.search("q"), []);
console.error = oe; globalThis.fetch = realFetch;
assert.ok(e2.some(e => e.includes("none were usable") && e.includes("weird")));
console.log("mapping test passed");

// v3: alert rules, sell speed, sold detection, budget guard
const { passesRules } = await import("./alerts.js");
const R = { minScore: 60, minMargin: 20, maxPrice: 5000, maxKm: 15 };
assert.ok(passesRules({ score: 70, marginPct: 25, price: 3000, distanceKm: 10 }, R));
assert.ok(!passesRules({ score: 70, marginPct: 10, price: 3000, distanceKm: 10 }, R));
assert.ok(!passesRules({ score: 70, marginPct: 25, price: 9000, distanceKm: 10 }, R));
assert.ok(!passesRules({ score: 70, marginPct: 25, price: 3000, distanceKm: 40 }, R));
assert.ok(passesRules({ score: 70, marginPct: 25, price: 3000, distanceKm: null }, R));
const { speedByName, findGone } = await import("./pipeline.js");
const day = 864e5, t0 = Date.now();
const srows = [1, 2, 3].map(d => ({ name: "switch oled", posted_at: new Date(t0 - d * day).toISOString(), removed_at: new Date(t0).toISOString() }));
assert.deepEqual(speedByName(srows), { "switch oled": 2 }); assert.deepEqual(speedByName(srows.slice(0, 2)), {});
const cand = [..."abcdefgh"].map(h => ({ hash: h }));
assert.deepEqual(findGone(cand, new Set([..."abcdef"])), ["g", "h"]); assert.equal(findGone(cand, new Set()), null);
const base = { name: "switch oled", price: 1000, resale: 1500, demand: 50, comments: 0, url: "u" };
const slow = rank([{ ...base }], 25, { "switch oled": 30 })[0], fast = rank([{ ...base }], 25, { "switch oled": 1 })[0];
assert.ok(fast.demand > slow.demand && fast.sellDays === 1);
const { markRemoved } = await import("./db.js");
const hit = []; const mk = data => { const q = { select: () => q, eq: () => q, is: () => q, gte: () => q, limit: () => q, update: () => q, in: (_c, h) => { hit.push(h); return q; }, then: res => res({ data, error: null }) }; return q; };
const gone = await markRemoved({ from: () => mk(cand) }, [{ source: "s", q: "x", oldest: "2026-01-01" }], new Set([..."abcdef"]));
assert.equal(gone, 2); assert.deepEqual(hit[0], ["g", "h"]);
const { checkBudget } = await import("./sources/apifyCore.js");
const lim = used => async () => ({ ok: true, json: async () => ({ data: { limits: { maxMonthlyUsageUsd: 5 }, current: { monthlyUsageUsd: used } } }) });
globalThis.fetch = lim(4.7); const b1 = await checkBudget(); assert.equal(b1.ok, false); assert.equal(b1.cap, 5);
globalThis.fetch = lim(1); assert.equal((await checkBudget()).ok, true);
globalThis.fetch = async () => ({ ok: false, status: 404 }); assert.equal((await checkBudget()).ok, true);
globalThis.fetch = realFetch;
console.log("v3 backend tests passed");
