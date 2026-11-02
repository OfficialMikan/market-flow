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
assert.equal(ranked.filter(r => r.intent !== "wanted")[0].price, 1100, "cheapest keyboard should rank first");
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
const slow = rank([{ ...base }], 25, { speed: { "switch oled": 30 } })[0], fast = rank([{ ...base }], 25, { speed: { "switch oled": 1 } })[0];
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

// ===== v4: buyer matching, privacy, details, groups, catalog =====
const P = await import("./pipeline.js"), A = await import("./ai.js"), Cat = await import("./catalog.js");
assert.ok(P.sameProduct("rtx 3060", "RTX 3060 graphics")); assert.ok(!P.sameProduct("rtx 3060", "rtx 3060 ti"), "ti is a different card");
assert.ok(!P.sameProduct("iphone 11", "iphone 12")); assert.ok(!P.sameProduct("switch oled", "switch lite")); assert.ok(P.sameProduct("iphone 11 128gb", "iphone 11 128gb"));
assert.equal(P.redact("Call 0917 123 4567 or +63 917-123-4567, mail a.b@x.com https://fb.com/x ₱1,200"), "Call or , mail ₱1,200");
assert.equal(P.sellerScore(null), null); assert.equal(P.sellerScore({ rating: 5, reviews: 100, tenureYears: 5 }), 100); assert.ok(P.sellerScore({ rating: 3, reviews: 2 }) < 60);
assert.equal(P.dedupe([{ url: "https://a/1", kind: "post" }, { url: "https://a/2", price: 0 }, { url: "https://a/3", price: 5 }]).length, 2, "posts may lack a price, listings may not");
assert.equal(A.textPrice("selling, price ₱1,800 only"), 1800); assert.equal(A.textPrice("php 2.5k"), 2500); assert.equal(A.textPrice("no price here"), null);
const nm = A.norm({ intent: "sell", name: "Switch OLED", category: "Gaming", price: 10500, specs: ["64GB", "call 09171234567"], issues: ["scratch on screen"], issue_level: 1, summary: "Switch OLED, light use. Text 09171234567" }, { title: "Switch", price: 10000 });
assert.equal(nm.name, "switch oled"); assert.equal(nm.price, 10500); assert.deepEqual(nm.specs, ["64GB", "call"]); assert.ok(!/0917/.test(nm.summary)); assert.equal(nm.issueLevel, 1);
const hw = A.heuristic({ title: "WTB RTX 3060", description: "looking for rtx 3060, budget php 12k" }); assert.equal(hw.intent, "wanted"); assert.equal(hw.price, 12000); assert.equal(hw.name, "rtx 3060");
// matching: supply <-> wanted, real sold price beats asking comps, issues cut the price, offer stays below ask
const sup = (n, price, extra = {}) => ({ url: "https://s/" + n + price, hash: "h" + price, title: n, name: n, price, intent: "sell", demand: 60, comments: 0, ...extra });
const want = { url: "https://w/1", hash: "w1", title: "WTB rtx 3060", name: "rtx 3060", intent: "wanted", price: 14000, kind: "post", demand: 70 };
const batch = [sup("rtx 3060", 9000), sup("rtx 3060", 11000), sup("rtx 3060", 12000), sup("rtx 3060", 12500), want];
const rk = rank(batch, 25, {});
const cheap = rk.find(r => r.price === 9000); assert.equal(cheap.confidence, "A"); assert.equal(cheap.sellBasis, "buyer"); assert.equal(cheap.matches[0].url, "https://w/1");
assert.ok(cheap.net > 1500 && cheap.net < 3000, "net " + cheap.net); assert.ok(cheap.offerPrice < 9000 && cheap.offerPrice >= 5400);
const wrow = rk.find(r => r.intent === "wanted"); assert.ok(wrow.matches.length >= 1 && wrow.matches[0].net > 0 && wrow.matches.every(m => m.net > 0));
const noBuyer = rank(batch.filter(r => r.intent !== "wanted"), 25, { soldPrice: { "rtx 3060": 11800 } }).find(r => r.price === 9000);
assert.equal(noBuyer.sellBasis, "sold"); assert.equal(noBuyer.confidence, "B"); assert.equal(noBuyer.sellPrice, 11800);
const dmg = rank([sup("rtx 3060", 9000, { issueLevel: 2 }), sup("rtx 3060", 9500), sup("rtx 3060", 10000), sup("rtx 3060", 10500)], 25, { soldPrice: { "rtx 3060": 11800 } });
assert.ok(dmg.find(r => r.price === 9000).net < noBuyer.net - 1500, "major issue cuts the expected resale");
assert.equal(P.soldMedianByName([1, 2, 3].map(i => ({ name: "x", price: 100 * i, removed_at: "2026-01-01" }))).x, 200);
// details selection, catalog rotation, group + fb + carousell mapping
const pool = [10, 100, 100, 100, 100].map((p, i) => ({ source: "carousell_apify", q: "k", kind: "listing", price: p, url: "u" + i }));
assert.deepEqual(P.pickForDetails(pool, 3, ["carousell_apify"]).map(x => x.price), [10]); assert.equal(P.pickForDetails(pool, 3, ["facebook_marketplace"]).length, 0);
const ql = Cat.buildQueryList(["Phones", "Gaming"]); assert.ok(ql.length >= 30 && ql[0] === "iphone 11" && ql[1] === "nintendo switch");
const s1 = Cat.pickSlice(ql, 0, 6), s2 = Cat.pickSlice(ql, s1.next, 6); assert.equal(s1.queries.length, 6); assert.equal(s2.queries[0], ql[6]);
assert.equal(Cat.pickSlice(ql, ql.length - 2, 4).queries[2], ql[0], "rotation wraps"); assert.ok(Cat.ALL_CATEGORIES.length >= 12);
const G = await import("./sources/groups.js"), F = await import("./sources/facebook.js"), Ap = await import("./sources/apify.js");
const gp = G.mapPost({ url: "https://www.facebook.com/groups/g/posts/1/", text: "Selling PS5 slim\nBrand new, ₱28,000 po. Angeles", time: "2026-11-01T01:00:00Z", user: { name: "Ana Cruz", profileUrl: "https://fb.com/ana" }, likesCount: 3 });
assert.equal(gp.kind, "post"); assert.equal(gp.title, "Selling PS5 slim"); assert.equal(gp.seller.name, "Ana Cruz"); assert.equal(gp.postedAt, "2026-11-01T01:00:00.000Z"); assert.equal(G.mapPost({ url: "u", text: "hi" }), null);
const fd = F.mapItem({ listingUrl: "https://fb/item/1", listingTitle: "GPU", priceAmount: 9000, description: "RTX 3060 12GB", condition: "Used - Good", sellerName: "Ben", sellerRatingAverage: 4.8, sellerRatingCount: 12, sellerJoinTime: "2019-01-01", listingPhotos: ["https://i/1.jpg", { url: "https://i/2.jpg" }], strikethroughPrice: "₱10,000" });
assert.equal(fd.seller.name, "Ben"); assert.equal(fd.images.length, 2); assert.equal(fd.oldPrice, 10000); assert.ok(fd.seller.tenureYears > 5);
const cd = Ap.mapItem({ url: "https://c/p/1", title: "Mac", price: 30000, description: "M1 8GB", seller: { username: "dealer1", url: "https://c/u/dealer1", rating: 4.9, reviewCount: 40, tenureYears: 3 }, isNegotiable: true, meetupLocation: "SM Clark" });
assert.equal(cd.seller.name, "dealer1"); assert.equal(cd.negotiable, true); assert.equal(cd.meetup, "SM Clark");
// save(): public table never gets seller names or descriptions; price drops are detected
const { save } = await import("./db.js");
const cap = { listings: [], listing_private: [], price_history: [] };
const oldRows = [{ hash: "h1", price: 2000, alerted: true, prev_price: null, price_drop_pct: 0 }];
const fsb = { from: t => ({ select: () => ({ in: async () => ({ data: oldRows, error: null }) }), upsert: async r => { cap[t].push(...r); return { error: null }; }, insert: async r => { cap[t].push(...r); return { error: null }; } }) };
const saved = await save(fsb, [{ hash: "h1", source: "s", url: "https://x/1", title: "Mac call 09171234567", price: 1500, name: "mac", intent: "sell", seller: { name: "Secret Seller", url: "https://p", rating: 4.5, reviews: 10 }, description: "private words 09171234567", matches: [{ url: "u", budget: 1 }], specs: ["8GB"], images: ["https://i/1.jpg", "http://bad"] }]);
assert.equal(saved[0].newDrop, 25); assert.equal(cap.listings[0].prev_price, 2000); assert.equal(cap.listings[0].price_drop_pct, 25);
assert.ok(!JSON.stringify(cap.listings).includes("Secret Seller") && !JSON.stringify(cap.listings).includes("private words"), "seller + description stay out of the public table");
assert.ok(!cap.listings[0].title.includes("0917")); assert.deepEqual(cap.listings[0].images, ["https://i/1.jpg"]);
assert.equal(cap.listing_private[0].seller_name, "Secret Seller"); assert.ok(cap.listing_private[0].seller_score > 0); assert.equal(cap.price_history[0].price, 1500);
console.log("v4 backend tests passed");
